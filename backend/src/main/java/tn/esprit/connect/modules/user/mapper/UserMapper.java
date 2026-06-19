package tn.esprit.connect.modules.user.mapper;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import tn.esprit.connect.modules.user.dto.UserResponse;
import tn.esprit.connect.modules.user.entity.User;

@Mapper(componentModel = "spring")
public interface UserMapper {
    @Mapping(target = "role", expression = "java(user.getRole().name())")
    @Mapping(target = "status", expression = "java(user.getStatus().name())")
    UserResponse toResponse(User user);
}
